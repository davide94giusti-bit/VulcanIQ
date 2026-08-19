-- Allow optimized WEBM hero videos in the existing public media bucket.
-- Raw MOV sources are processed locally in the admin browser and are never
-- uploaded to Storage by the optimizer. Preserve any MIME types already
-- configured in production rather than replacing the bucket allowlist.

begin;

update storage.buckets
set allowed_mime_types = case
  when allowed_mime_types is null then null
  when 'video/webm' = any(allowed_mime_types) then allowed_mime_types
  else array_append(allowed_mime_types, 'video/webm')
end
where id = 'vulcaniq-public-assets';

commit;
