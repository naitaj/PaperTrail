-- 002_roles.sql: Least privilege roles for web application (TRD §8.3)
-- In production/Neon, replace PASSWORD with your secure secret.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'papertrail_app') THEN
    CREATE ROLE papertrail_app LOGIN;
  END IF;
END
$$;

-- Grant read-only access to published corpus and search indices
GRANT SELECT ON documents, document_pages, chunk_configs, chunks, chunk_embeddings,
                lexical_stats, lexical_terms TO papertrail_app;

-- Grant read/write access to rate limiting counters
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_counters TO papertrail_app;

-- Explicitly revoke access to evaluation tables to prevent test-set data leakage
REVOKE ALL ON eval_questions, eval_runs, eval_results, eval_annotations FROM papertrail_app;
