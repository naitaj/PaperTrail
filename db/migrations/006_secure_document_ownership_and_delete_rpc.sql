-- 006_secure_document_ownership_and_delete_rpc.sql
-- Enforces authenticated user ownership (owner_id UUID via auth.uid()),
-- strict Row-Level Security (RLS) policies on user-upload documents, and a
-- SECURITY INVOKER transactional RPC public.delete_user_document(p_doc_id text)
-- that derives identity exclusively from auth.uid() and cannot bypass RLS.

-- 1. Add owner_id UUID column to documents if not present
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS owner_id uuid;

CREATE INDEX IF NOT EXISTS idx_documents_owner_id
  ON public.documents (owner_id)
  WHERE owner_id IS NOT NULL;

-- 2. Grant authenticated role controlled privileges on document tables so that
--    when the backend executes SET LOCAL ROLE authenticated (or PostgREST calls
--    with a verified JWT), PostgreSQL enforces RLS policies rather than BYPASSRLS.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_pages TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.chunks TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.chunk_embeddings TO authenticated;
  END IF;
END $$;

-- 3. RLS Policies on public.documents
DROP POLICY IF EXISTS "Authenticated users can insert their own user-upload documents" ON public.documents;
CREATE POLICY "Authenticated users can insert their own user-upload documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND corpus_version IN ('user-upload', 'staging-test-ephemeral')
    AND owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can update their own user-upload documents" ON public.documents;
CREATE POLICY "Authenticated users can update their own user-upload documents"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND corpus_version IN ('user-upload', 'staging-test-ephemeral')
    AND owner_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND corpus_version IN ('user-upload', 'staging-test-ephemeral')
    AND owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can delete their own user-upload documents" ON public.documents;
CREATE POLICY "Authenticated users can delete their own user-upload documents"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND corpus_version IN ('user-upload', 'staging-test-ephemeral')
    AND owner_id IS NOT NULL
    AND owner_id = auth.uid()
  );

-- 4. RLS Policies on child tables (document_pages, chunks, chunk_embeddings) for owned documents
DROP POLICY IF EXISTS "Authenticated users can manage pages of owned documents" ON public.document_pages;
CREATE POLICY "Authenticated users can manage pages of owned documents"
  ON public.document_pages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.doc_id = document_pages.doc_id
        AND d.corpus_version IN ('user-upload', 'staging-test-ephemeral')
        AND d.owner_id IS NOT NULL
        AND d.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.doc_id = document_pages.doc_id
        AND d.corpus_version IN ('user-upload', 'staging-test-ephemeral')
        AND d.owner_id IS NOT NULL
        AND d.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can manage chunks of owned documents" ON public.chunks;
CREATE POLICY "Authenticated users can manage chunks of owned documents"
  ON public.chunks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.doc_id = chunks.doc_id
        AND d.corpus_version IN ('user-upload', 'staging-test-ephemeral')
        AND d.owner_id IS NOT NULL
        AND d.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.doc_id = chunks.doc_id
        AND d.corpus_version IN ('user-upload', 'staging-test-ephemeral')
        AND d.owner_id IS NOT NULL
        AND d.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can manage embeddings of owned documents" ON public.chunk_embeddings;
CREATE POLICY "Authenticated users can manage embeddings of owned documents"
  ON public.chunk_embeddings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chunks c
      JOIN public.documents d ON d.doc_id = c.doc_id
      WHERE c.chunk_id = chunk_embeddings.chunk_id
        AND d.corpus_version IN ('user-upload', 'staging-test-ephemeral')
        AND d.owner_id IS NOT NULL
        AND d.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chunks c
      JOIN public.documents d ON d.doc_id = c.doc_id
      WHERE c.chunk_id = chunk_embeddings.chunk_id
        AND d.corpus_version IN ('user-upload', 'staging-test-ephemeral')
        AND d.owner_id IS NOT NULL
        AND d.owner_id = auth.uid()
    )
  );

-- 5. Secured Transactional RPC: public.delete_user_document(p_doc_id text)
--    SECURITY INVOKER so RLS is strictly enforced and cannot be bypassed.
--    Derives authenticated identity exclusively from auth.uid() inside PostgreSQL.
DROP FUNCTION IF EXISTS public.delete_user_document(text, text);
DROP FUNCTION IF EXISTS public.delete_user_document(text);

CREATE OR REPLACE FUNCTION public.delete_user_document(p_doc_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_corpus_version text;
  v_owner_id uuid;
  v_deleted_chunks integer := 0;
  v_deleted_docs integer := 0;
BEGIN
  -- 1. Derive caller identity exclusively from Supabase JWT context (auth.uid())
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: No authenticated Supabase session (auth.uid() is NULL).'
      USING ERRCODE = '28000';
  END IF;

  -- 2. Inspect target document (using plain SELECT so SELECT RLS policy applies,
  --    whereas FOR UPDATE requires UPDATE RLS permission and would mask Forbidden as Not Found)
  SELECT d.corpus_version, d.owner_id
    INTO v_corpus_version, v_owner_id
    FROM public.documents d
   WHERE d.doc_id = p_doc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found: %', p_doc_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Block deletion of official research corpus documents
  IF v_corpus_version NOT IN ('user-upload', 'staging-test-ephemeral') THEN
    RAISE EXCEPTION 'Forbidden: Official research corpus documents (corpus_version=%) cannot be deleted.', v_corpus_version
      USING ERRCODE = '42501';
  END IF;

  -- 4. Verify strict ownership match against auth.uid()
  IF v_owner_id IS NULL OR v_owner_id <> v_uid THEN
    RAISE EXCEPTION 'Forbidden: Authenticated user (%) is not the owner of document %.', v_uid, p_doc_id
      USING ERRCODE = '42501';
  END IF;

  -- 5. Delete child embeddings, chunks, pages, and document atomically
  DELETE FROM public.chunk_embeddings
   WHERE chunk_id IN (SELECT chunk_id FROM public.chunks WHERE doc_id = p_doc_id);

  WITH del_c AS (
    DELETE FROM public.chunks WHERE doc_id = p_doc_id RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted_chunks FROM del_c;

  DELETE FROM public.document_pages WHERE doc_id = p_doc_id;

  WITH del_d AS (
    DELETE FROM public.documents
     WHERE doc_id = p_doc_id
       AND owner_id = v_uid
       AND corpus_version IN ('user-upload', 'staging-test-ephemeral')
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted_docs FROM del_d;

  IF v_deleted_docs = 0 THEN
    RAISE EXCEPTION 'Forbidden: Document deletion blocked by Row-Level Security policy.'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'doc_id', p_doc_id,
    'deleted_by_uid', v_uid,
    'deleted_chunks', v_deleted_chunks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_document(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_user_document(text) FROM anon, public;
