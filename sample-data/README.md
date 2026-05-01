# Sample exports

This folder contains synthetic example output in each supported format.
None of the content is real; it exists only to show the shape of exports
and to give contributors something to validate against when changing the
serializers in `background.js`.

Files:

- `sample-conversation.json` — the canonical JSON schema (`open-chat-archiver/1`).
- `sample-conversation.csv` — the CSV produced by the CSV serializer.
- `sample-conversation.txt` — the plain-text transcript.
- `sample-conversation.html` — the standalone HTML transcript export.

If you change the serializers, re-run the extension against any
conversation, export to each format, and diff against these files for a
quick sanity check. Or add a tiny harness in `scripts/` — contributions
welcome.
