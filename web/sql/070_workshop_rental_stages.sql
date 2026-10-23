ALTER TABLE web_workshop_visits DROP CONSTRAINT web_workshop_visits_stage_check;
ALTER TABLE web_workshop_visits ADD CONSTRAINT web_workshop_visits_stage_check CHECK(stage IN ('received','diagnosis','approval','parts','repair','ready','quotation','factory_warranty','rj_warranty','return_unrepaired','scheduled','disposal'));
