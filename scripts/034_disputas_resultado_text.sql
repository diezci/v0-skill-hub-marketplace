-- resolverDisputa guarda la nota del admin en `resultado`, que era varchar(50):
-- cualquier nota de más de 50 caracteres hacía fallar el UPDATE de cierre
-- DESPUÉS de haber movido ya el dinero (reembolso o liberación), dejando la
-- disputa abierta con los fondos ya transferidos. Se amplía a text.
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

alter table disputas alter column resultado type text;
