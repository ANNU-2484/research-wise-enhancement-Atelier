
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
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id, c.paper_id, c.content, c.chunk_index,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.paper_chunks c
  WHERE c.topic_id = match_topic_id
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
