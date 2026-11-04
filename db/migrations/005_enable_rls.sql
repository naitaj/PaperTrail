-- 005_enable_rls.sql: Enable Row-Level Security (RLS) on all public tables (TRD §8.3, TRD §12.1)
-- Fixes Supabase Security Advisor "rls_disabled_in_public" critical vulnerability.
-- Protects database from unauthorized PostgREST HTTP access while preserving
-- direct PostgreSQL pooler access for Next.js and Python.

-- 1. Enable RLS on all 12 tables in the public schema
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chunk_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lexical_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lexical_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eval_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eval_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eval_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS _migrations ENABLE ROW LEVEL SECURITY;

-- 2. Revoke all write/modification privileges from public API roles (anon, authenticated)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON eval_questions, eval_runs, eval_results, eval_annotations, rate_limit_counters FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON eval_questions, eval_runs, eval_results, eval_annotations, rate_limit_counters FROM authenticated;
  END IF;
END $$;

-- 3. Read-only policies for published research corpus metadata and search indices (if accessed via PostgREST)
DROP POLICY IF EXISTS "Public read access to documents" ON documents;
CREATE POLICY "Public read access to documents" ON documents
  FOR SELECT TO anon, authenticated USING (status = 'ready');

DROP POLICY IF EXISTS "Public read access to document_pages" ON document_pages;
CREATE POLICY "Public read access to document_pages" ON document_pages
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access to chunk_configs" ON chunk_configs;
CREATE POLICY "Public read access to chunk_configs" ON chunk_configs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access to chunks" ON chunks;
CREATE POLICY "Public read access to chunks" ON chunks
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access to chunk_embeddings" ON chunk_embeddings;
CREATE POLICY "Public read access to chunk_embeddings" ON chunk_embeddings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access to lexical_stats" ON lexical_stats;
CREATE POLICY "Public read access to lexical_stats" ON lexical_stats
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access to lexical_terms" ON lexical_terms;
CREATE POLICY "Public read access to lexical_terms" ON lexical_terms
  FOR SELECT TO anon, authenticated USING (true);

-- Note: No policies are created for eval_questions, eval_runs, eval_results,
-- eval_annotations, or rate_limit_counters. With RLS enabled and no policies,
-- access is completely denied to anon/authenticated roles by default, preventing test set leakage.
