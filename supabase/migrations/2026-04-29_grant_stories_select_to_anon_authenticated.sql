-- stories table was created without grants; anon/authenticated need SELECT
-- for PostgREST to resolve the articles→stories embed on the home page.
GRANT SELECT ON public.stories TO anon, authenticated;
