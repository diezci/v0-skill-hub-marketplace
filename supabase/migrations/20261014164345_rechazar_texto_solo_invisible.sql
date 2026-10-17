begin;

-- Content validation only: preserve the original text, including legitimate
-- joining/formatting characters in multilingual text and emoji sequences.
-- Ignore whitespace, controls, Unicode Default_Ignorable_Code_Point and the
-- blank Braille cell when deciding whether any visible content remains.
-- Ranges generated from Node Unicode 17.0; NUL cannot occur in PostgreSQL text.
create or replace function diime_private.texto_tiene_contenido(p_texto text)
returns boolean language sql immutable set search_path='' as $$
  select length(regexp_replace(coalesce(p_texto,''), U&'[\0001-\0020\007f-\00a0\00ad\034f\061c\115f-\1160\1680\17b4-\17b5\180b-\180f\2000-\200f\2028-\202f\205f-\206f\2800\3000\3164\fe00-\fe0f\feff\ffa0\fff0-\fff8\+01bca0-\+01bca3\+01d173-\+01d17a\+0e0000-\+0e0fff]', '', 'g')) > 0;
$$;
revoke all on function diime_private.texto_tiene_contenido(text) from public,anon;
grant execute on function diime_private.texto_tiene_contenido(text) to authenticated,service_role;

commit;
