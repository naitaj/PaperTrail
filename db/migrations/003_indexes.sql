-- 003_indexes.sql: Search and lookup indexes (TRD §8.2)

CREATE INDEX IF NOT EXISTS chunks_tsv_gin   ON chunks USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS chunks_cfg_doc   ON chunks (config_id, doc_id) WHERE NOT is_references;
CREATE INDEX IF NOT EXISTS chunks_doc_page  ON chunks (doc_id, page_start);

CREATE INDEX IF NOT EXISTS eval_results_run ON eval_results (run_id);
CREATE INDEX IF NOT EXISTS eval_annotations_run ON eval_annotations (run_id);
