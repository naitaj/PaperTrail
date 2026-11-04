-- 004_minilm_embeddings.sql: Set embedding vector dimension to 384 for sentence-transformers/all-MiniLM-L6-v2

ALTER TABLE chunk_embeddings ALTER COLUMN embedding TYPE vector(384);

