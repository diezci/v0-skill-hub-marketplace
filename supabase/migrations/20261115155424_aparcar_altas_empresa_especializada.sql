-- Specialized company onboarding is paused while new providers use Mi perfil.
-- Keep every existing entity, member, contract, invoice snapshot and payout
-- destination. Read/update/settlement/revocation RPCs retain their permissions.
-- Re-enabling this flow requires restoring these grants AND the product flag.
revoke execute on function public.vincular_mi_empresa(text,text,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function diime_private.vincular_empresa(text,text,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.empresa_crear_invitacion(text,text,text,jsonb,boolean) from public, anon, authenticated;
revoke execute on function diime_private.empresa_crear_invitacion(text,text,text,jsonb,boolean) from public, anon, authenticated;
revoke execute on function public.empresa_aceptar_invitacion(text) from public, anon, authenticated;
revoke execute on function diime_private.empresa_aceptar_invitacion(text) from public, anon, authenticated;
