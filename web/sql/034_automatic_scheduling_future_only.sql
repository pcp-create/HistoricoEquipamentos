-- Rule changes never backfill historical orders. Evaluate only newly imported OSs.
DROP TRIGGER IF EXISTS web_auto_schedule_existing_orders ON web_service_schedule_settings;
DROP FUNCTION IF EXISTS web_auto_schedule_existing_orders();
DROP TRIGGER IF EXISTS web_auto_schedule_changed_order ON m8_ordens_servico;
CREATE TRIGGER web_auto_schedule_changed_order AFTER INSERT ON m8_ordens_servico
FOR EACH ROW EXECUTE FUNCTION web_auto_schedule_changed_order();
