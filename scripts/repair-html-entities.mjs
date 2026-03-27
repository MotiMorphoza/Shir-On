import db from '../backend/src/db/index.js';
import { repairHtmlEntities, repairNormalizedFields } from '../backend/src/db/repair.js';

const entityResult = repairHtmlEntities();
const normalizedResult = repairNormalizedFields();

console.log(
  JSON.stringify(
    {
      entityResult,
      normalizedResult,
    },
    null,
    2
  )
);

db.close();
