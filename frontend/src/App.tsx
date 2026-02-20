import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type UploadResponse = {
  document_id: string
  pages_loaded: number
  chunks_indexed: number
}

type ContextChunk = {
  page: number | null
  content: string
}

type AskResponse = {
  answer: string
  context: ContextChunk[]
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [question, setQuestion] = useState('')
  const [uploadInfo, setUploadInfo] = useState<UploadResponse | null>(null)
  const [answer, setAnswer] = useState<AskResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingUpload, setLoadingUpload] = useState(false)
  const [loadingAsk, setLoadingAsk] = useState(false)

  const canAsk = useMemo(
    () => Boolean(uploadInfo?.document_id && question.trim().length > 2 && !loadingAsk),
    [uploadInfo?.document_id, question, loadingAsk],
  )

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault()
    if (!file) {
      setError('Please select a PDF first.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
      setError(null)
      setLoadingUpload(true)
      setAnswer(null)
      const res = await fetch(`${API_BASE}/api/upload-rfp`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(await res.text())
      const data: UploadResponse = await res.json()
      setUploadInfo(data)
    } catch (err) {
      setError(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoadingUpload(false)
    }
  }

  const handleAsk = async (event: FormEvent) => {
    event.preventDefault()
    if (!uploadInfo?.document_id) {
      setError('Upload an RFP before asking a question.')
      return
    }

    try {
      setError(null)
      setLoadingAsk(true)
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: uploadInfo.document_id,
          question,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data: AskResponse = await res.json()
      setAnswer(data)
    } catch (err) {
      setError(`Question failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoadingAsk(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="card">
        <h1>AEC RFP Assistant</h1>
        <p>Upload an RFP PDF and ask natural-language questions to get a context-backed response.</p>

        <form onSubmit={handleUpload} className="stack">
          <label htmlFor="rfp">RFP PDF</label>
          <input
            id="rfp"
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" disabled={loadingUpload}>
            {loadingUpload ? 'Uploading...' : 'Upload PDF'}
          </button>
        </form>

        {uploadInfo && (
          <p className="success">
            Indexed {uploadInfo.pages_loaded} pages into {uploadInfo.chunks_indexed} chunks.
          </p>
        )}

        <form onSubmit={handleAsk} className="stack">
          <label htmlFor="question">Question</label>
          <textarea
            id="question"
            rows={5}
            placeholder="What is the proposal due date, required attachments, and scoring criteria?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" disabled={!canAsk}>
            {loadingAsk ? 'Analyzing...' : 'Ask'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </section>

      {answer && (
        <section className="card">
          <h2>Detailed Answer</h2>
          <pre>{answer.answer}</pre>
          <h3>Retrieved Context</h3>
          <ul>
            {answer.context.map((chunk, index) => (
              <li key={`${index}-${chunk.page ?? 'na'}`}>
                <strong>{chunk.page ? `Page ${chunk.page}` : 'Page unknown'}:</strong> {chunk.content}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

export default App
