-- Correct the two named seed landmarks only while their example coordinates are intact.
-- Eiffel Tower: https://www.wikidata.org/wiki/Q243
UPDATE places SET lat=48.858296, lng=2.294479
WHERE id='attraction-eiffel-tower' AND kind='attraction' AND parent_id='city-paris'
 AND abs(lat-48.845)<0.00001 AND abs(lng-2.335)<0.00001;

-- Great Wall, Badaling section: https://whc.unesco.org/document/216747
UPDATE places SET lat=40.35, lng=116.017,
 name='{"zh":"八达岭长城","en":"Badaling Great Wall"}'::jsonb,
 aliases=ARRAY(SELECT DISTINCT alias FROM unnest(aliases || ARRAY['长城','万里长城','Great Wall']) AS a(alias))
WHERE id='attraction-great-wall' AND kind='attraction' AND parent_id='city-beijing'
 AND abs(lat-39.885)<0.00001 AND abs(lng-116.385)<0.00001;
