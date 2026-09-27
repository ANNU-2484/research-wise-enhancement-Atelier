
CREATE POLICY "papers_select_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'papers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "papers_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'papers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "papers_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'papers' AND (storage.foldername(name))[1] = auth.uid()::text);
