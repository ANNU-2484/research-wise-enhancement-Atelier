
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.paper_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_chunks TO authenticated;
GRANT ALL ON public.paper_chunks TO service_role;

ALTER TABLE public.paper_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY paper_chunks_own ON public.paper_chunks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS paper_chunks_topic_idx ON public.paper_chunks(topic_id);
CREATE INDEX IF NOT EXISTS paper_chunks_embedding_idx
  ON public.paper_chunks USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_paper_chunks(
  query_embedding vector(768),
  match_topic_id uuid,
  match_count int DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  paper_id uuid,
  content text,
  chunk_index int,
  similarity float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.paper_id, c.content, c.chunk_index,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.paper_chunks c
  WHERE c.topic_id = match_topic_id
    AND c.user_id = auth.uid()
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
