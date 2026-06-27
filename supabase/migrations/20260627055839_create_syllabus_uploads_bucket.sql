-- Create storage bucket for syllabus file uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'syllabus-uploads',
  'syllabus-uploads',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Users can only upload/read their own files (path starts with their user_id)
CREATE POLICY "Users upload own syllabi"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'syllabus-uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own syllabi"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'syllabus-uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own syllabi"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'syllabus-uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
