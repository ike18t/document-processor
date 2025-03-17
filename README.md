Intent:
create an app that will manage my scanned mail by doing the following:

- monitors a folder for new pdfs
- runs OCR on new pdfs
- generates a contextualized filename
- adds contextual macOS tags on the file
- moves the pdf to a new folder with the structure of year/month/filename.pdf.

to start:
`npm start`

dependencies:
`brew install tags ollama ocrmypdf`

model can be installed via ollama and configured in .env but needs to be a visual model that accepts multple images. Developed with llava.
`ollama pull llava:13b`

ollama http server needs to be running
`ollama serve`
