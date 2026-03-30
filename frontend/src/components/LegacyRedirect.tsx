import { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { fetchAdModelSlug } from '../lib/api'

export function LegacyAdRedirect() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    const adId = Number(id)
    if (isNaN(adId)) {
      setError(true)
      return
    }
    fetchAdModelSlug(adId)
      .then((data) => {
        if (data.slug) {
          navigate(`/models/${data.slug}/ads/${adId}`, { replace: true })
        } else {
          setError(true)
        }
      })
      .catch(() => setError(true))
  }, [id, navigate])

  if (error) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
    </div>
  )
}
