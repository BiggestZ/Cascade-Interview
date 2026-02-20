import os
import tempfile
import uuid
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from pydantic import BaseModel, Field

app = FastAPI(title="RFP Assistant API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    document_id: str = Field(..., description="ID returned by /api/upload-rfp")
    question: str = Field(..., min_length=3)


class ContextChunk(BaseModel):
    page: int | None
    content: str


class AskResponse(BaseModel):
    answer: str
    context: list[ContextChunk]


class RfpStore:
    def __init__(self) -> None:
        self._retrievers: dict[str, BM25Retriever] = {}
        self._chunks: dict[str, list[Document]] = {}

    def create(self, chunks: list[Document]) -> str:
        document_id = str(uuid.uuid4())
        retriever = BM25Retriever.from_documents(chunks)
        retriever.k = 4
        self._retrievers[document_id] = retriever
        self._chunks[document_id] = chunks
        return document_id

    def get(self, document_id: str) -> BM25Retriever:
        retriever = self._retrievers.get(document_id)
        if retriever is None:
            raise HTTPException(status_code=404, detail="Unknown document_id")
        return retriever


store = RfpStore()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/upload-rfp")
async def upload_rfp(file: UploadFile = File(...)) -> dict[str, Any]:
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Please upload a PDF file")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        temp_pdf_path = tmp.name

    try:
        loader = PyPDFLoader(temp_pdf_path)
        pages = loader.load()
    finally:
        os.remove(temp_pdf_path)

    if not pages:
        raise HTTPException(status_code=400, detail="No text could be extracted from PDF")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=200)
    chunks = splitter.split_documents(pages)
    document_id = store.create(chunks)

    return {
        "document_id": document_id,
        "pages_loaded": len(pages),
        "chunks_indexed": len(chunks),
    }


def _build_answer(question: str, docs: list[Document]) -> str:
    if not docs:
        return "I could not find relevant content in the uploaded RFP."

    bullet_points: list[str] = []
    for i, doc in enumerate(docs, start=1):
        page = doc.metadata.get("page")
        page_prefix = f"(Page {page + 1}) " if isinstance(page, int) else ""
        snippet = doc.page_content.strip().replace("\n", " ")
        snippet = snippet[:320] + ("..." if len(snippet) > 320 else "")
        bullet_points.append(f"{i}. {page_prefix}{snippet}")

    return (
        f"Question: {question}\n\n"
        "Based on the retrieved RFP context, here is a detailed response draft:\n"
        "- Review the cited sections below and align your answer with project scope, "
        "submission requirements, schedule constraints, and evaluation criteria.\n"
        "- Confirm any mandatory forms, insurance/bonding thresholds, and technical "
        "qualifications directly from the referenced pages.\n"
        "- If a section appears ambiguous, call out assumptions before final submission.\n\n"
        "Relevant context:\n"
        + "\n".join(bullet_points)
    )


@app.post("/api/ask", response_model=AskResponse)
def ask_question(request: AskRequest) -> AskResponse:
    retriever = store.get(request.document_id)
    docs = retriever.invoke(request.question)

    context = [
        ContextChunk(
            page=(doc.metadata.get("page") + 1 if isinstance(doc.metadata.get("page"), int) else None),
            content=doc.page_content,
        )
        for doc in docs
    ]

    return AskResponse(answer=_build_answer(request.question, docs), context=context)
