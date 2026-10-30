-- 001_init.sql: Core schema for PaperTrail (TRD §8.2)

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Documents metadata
CREATE TABLE IF NOT EXISTS documents (
  doc_id          text PRIMARY KEY CHECK (doc_id ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  title           text,
  authors         text[],
  year            smallint,
  venue           text,
  doi             text,
  source_url      text NOT NULL,
  license         text,
  sha256          char(64) NOT NULL UNIQUE,
  text_hash       char(64),
  n_pages         integer CHECK (n_pages > 0),
  status          text NOT NULL CHECK (status IN
                    ('ready','duplicate','empty','corrupt','unsupported_scanned','failed')),
  status_detail   text,
  duplicate_of    text REFERENCES documents(doc_id),
  corpus_version  text NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now()
);

-- Document pages (1-based index)
CREATE TABLE IF NOT EXISTS document_pages (
  doc_id         text NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  page_index     integer NOT NULL CHECK (page_index >= 1),
  page_label     text,
  char_count     integer NOT NULL,
  quality_flags  text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (doc_id, page_index)
);

-- Chunk configurations (e.g. ck256, ck640)
CREATE TABLE IF NOT EXISTS chunk_configs (
  config_id   text PRIMARY KEY,
  params      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Extracted chunks
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id         text PRIMARY KEY,
  doc_id           text NOT NULL,
  config_id        text NOT NULL REFERENCES chunk_configs(config_id),
  page_start       integer NOT NULL,
  page_end         integer NOT NULL,
  ordinal          integer NOT NULL,
  section_title    text,
  text             text NOT NULL,
  text_hash        char(64) NOT NULL,
  token_count      integer NOT NULL,
  lex_len          integer NOT NULL DEFAULT 0,
  is_references    boolean NOT NULL DEFAULT false,
  has_table        boolean NOT NULL DEFAULT false,
  math_heavy       boolean NOT NULL DEFAULT false,
  layout_uncertain boolean NOT NULL DEFAULT false,
  content_tsv      tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  CHECK (page_end >= page_start),
  UNIQUE (doc_id, config_id, ordinal),
  FOREIGN KEY (doc_id, page_start) REFERENCES document_pages (doc_id, page_index) ON DELETE CASCADE
);

-- Chunk vector embeddings
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id         text NOT NULL REFERENCES chunks(chunk_id) ON DELETE CASCADE,
  embedding_model  text NOT NULL,
  embedding        vector(1536) NOT NULL,
  text_hash        char(64) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, embedding_model)
);

-- Lexical statistics for BM25
CREATE TABLE IF NOT EXISTS lexical_stats (
  config_id    text PRIMARY KEY REFERENCES chunk_configs(config_id),
  n_chunks     integer NOT NULL,
  avgdl        double precision NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now()
);

-- Lexical term frequencies for BM25 IDF
CREATE TABLE IF NOT EXISTS lexical_terms (
  config_id  text NOT NULL REFERENCES chunk_configs(config_id),
  term       text NOT NULL,
  df         integer NOT NULL CHECK (df > 0),
  PRIMARY KEY (config_id, term)
);

-- Evaluation dataset questions
CREATE TABLE IF NOT EXISTS eval_questions (
  question_id       text PRIMARY KEY,
  split             text NOT NULL CHECK (split IN ('dev','test')),
  question          text NOT NULL,
  category          text NOT NULL CHECK (category IN ('direct_factual','cross_section',
                      'multi_source','partially_answerable','unanswerable_in_domain',
                      'out_of_corpus','ambiguous')),
  answerability     text NOT NULL CHECK (answerability IN
                      ('answerable','partial','unanswerable','out_of_corpus')),
  reference_answer  text,
  gold_evidence     jsonb NOT NULL DEFAULT '[]',
  corpus_version    text NOT NULL,
  authored_by       text,
  reviewed_by       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Evaluation runs
CREATE TABLE IF NOT EXISTS eval_runs (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   text NOT NULL,
  label           text NOT NULL,
  split           text NOT NULL CHECK (split IN ('dev','test')),
  config          jsonb NOT NULL,
  git_commit      text NOT NULL,
  corpus_version  text NOT NULL,
  is_final        boolean NOT NULL DEFAULT false,
  status          text NOT NULL CHECK (status IN ('running','complete','failed')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  totals          jsonb
);

-- Evaluation results per question
CREATE TABLE IF NOT EXISTS eval_results (
  run_id             uuid NOT NULL REFERENCES eval_runs(run_id) ON DELETE CASCADE,
  question_id        text NOT NULL REFERENCES eval_questions(question_id),
  repeat             smallint NOT NULL DEFAULT 1,
  retrieved          jsonb NOT NULL,
  response           jsonb,
  raw_model_output   jsonb,
  timings_ms         jsonb,
  usage              jsonb,
  cost_usd           numeric(10,6),
  retrieval_metrics  jsonb,
  auto_checks        jsonb,
  error              text,
  PRIMARY KEY (run_id, question_id, repeat)
);

-- Human or model annotations
CREATE TABLE IF NOT EXISTS eval_annotations (
  run_id       uuid NOT NULL,
  question_id  text NOT NULL,
  repeat       smallint NOT NULL,
  annotator    text NOT NULL,
  labels       jsonb NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, question_id, repeat, annotator),
  FOREIGN KEY (run_id, question_id, repeat) REFERENCES eval_results(run_id, question_id, repeat)
    ON DELETE CASCADE
);

-- Rate limiter counters
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket        text NOT NULL,
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
