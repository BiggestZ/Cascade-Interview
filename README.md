## AEC RFP Assistant (LangChain RAG)

This project provides a minimal full-stack starter for AEC teams to:

1. Upload an RFP PDF.
2. Ask natural-language questions about the uploaded RFP.
3. Get a detailed answer draft plus retrieved context snippets.

## Stack

- **Backend**: FastAPI + LangChain loaders/splitters/retriever.
- **Frontend**: React + Vite + TypeScript.
- **RAG pattern**: PDF ingestion → chunking → BM25 retrieval → contextual answer composition.

## Backend setup

```bash
uv sync
uv run uvicorn main:app --reload --port 8000
```

API endpoints:

- `POST /api/upload-rfp` (multipart form with `file` PDF)
- `POST /api/ask` (`document_id` + `question`)
- `GET /health`

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Optional: set backend URL in frontend with `VITE_API_BASE`.

## Notes

- Uploaded documents are stored in-memory for this starter app.
- Retrieval uses LangChain `BM25Retriever` for a local, keyless baseline.
