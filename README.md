# Document Processor

Document Processor is an application designed to streamline the management of scanned mail by automating tasks such as OCR processing, contextual renaming, tagging, and organized storage of PDF files. It leverages a visual Large Language Model (LLM) to enhance text extraction, recognition, and contextual understanding for more accurate file naming and tagging.

## Features

- **Folder Monitoring**: Continuously watches a specified folder for new PDF files.
- **OCR Processing**: Applies Optical Character Recognition (OCR) to new PDFs to extract text content.
- **Contextual Renaming**: Generates descriptive filenames based on the content of each PDF.
- **macOS Tagging**: Assigns contextual macOS tags to files for enhanced organization and searchability.
- **Structured Archiving**: Moves processed PDFs to a designated folder, organizing them by year and month.

## Prerequisites

Before setting up Document Processor, ensure that the following dependencies are installed:

- **tags**: A command-line tool for manipulating macOS file tags.
- **ollama**: A tool for managing and serving machine learning models.
- **ocrmypdf**: A utility to add OCR text layers to PDFs.

Install these dependencies using [Homebrew](https://brew.sh/):

```bash
brew install tag ollama ocrmypdf
```

## Model Setup

Document Processor utilizes a visual model compatible with multiple images. The application has been developed and tested with the `llava` model. To set up the model:

1. Pull the `llava:13b` model using `ollama`:

   ```bash
   ollama pull llava:13b
   ```

2. Configure the model in the `.env` file. Ensure that the model settings align with your requirements.

## Starting the Application

The application uses foreman to start both the ollama HTTP server and the document processor simultaneously.

To start the application, simply run:

```bash
npm start
```

The application will begin monitoring the specified folder for new PDFs and process them as configured.

## Configuration

Adjust application settings, such as the watch folder path and processing parameters, in the `.env` file. Ensure that all configurations are set according to your environment and preferences.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

Special thanks to the developers of `tag`, `ollama`, and `ocrmypdf` for their invaluable tools that make this application possible.
