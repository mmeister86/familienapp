import { Route, Routes } from 'react-router'

function Home() {
  return <main>Familienapp</main>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
