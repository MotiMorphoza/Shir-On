import db from '../backend/src/db/index.js';
import {
  repairHtmlEntities,
  repairLyricsFormatting,
  repairNormalizedFields,
} from '../backend/src/db/repair.js';

const entityResult = repairHtmlEntities();
const normalizedResult = repairNormalizedFields();
const lyricsFormattingResult = repairLyricsFormatting();

console.log(
  JSON.stringify(
    {
      entityResult,
      normalizedResult,
      lyricsFormattingResult,
    },
    null,
    2
  )
);

db.close();
