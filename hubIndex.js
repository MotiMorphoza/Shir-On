window.HUB_INDEX = {
  languagePairs: [
    { id: "he-en", title: "Hebrew → English" },
    { id: "pl-en", title: "Polish → English" },
    { id: "ar-he", title: "Arabic → Hebrew" },
    { id: "es-he", title: "Spanish → Hebrew" }
  ],

  groups: [
    { id: "grammar", title: "Grammar & Structure" },
    { id: "vocabulary", title: "Vocabulary & Meaning" },
    { id: "daily", title: "Daily Life" },
    { id: "communication", title: "Communication" },
    { id: "advanced", title: "Advanced & Fluency" },
    { id: "others", title: "Others" }
  ],

  topics: [
    {
      id: "verb_infinitives",
      title: "Verb infinitives",
      group: "grammar",
      files: {
        "he-en": ["Style.csv"],
        "pl-en": ["pl-en_verb_infinitives_999.csv"],
        "ar-he": ["Dogi.csv"]
      }
    }
  ]
};
