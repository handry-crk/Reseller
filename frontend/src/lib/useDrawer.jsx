import { useState } from 'react'
import ResellerDrawer from '../components/ResellerDrawer'

/** Hook kecil supaya tiap halaman bisa membuka detail/form reseller dengan API yang sama. */
export function useDrawer() {
  const [st, setSt] = useState({ mode: null, id: null })
  const openDetail = (id) => setSt({ mode: 'detail', id })
  const openForm = (id = null) => setSt({ mode: 'form', id })
  const close = () => setSt({ mode: null, id: null })
  const drawer = <ResellerDrawer id={st.id} mode={st.mode} onClose={close} onModeChange={(mode, id) => setSt({ mode, id })} />
  return { openDetail, openForm, close, drawer }
}
