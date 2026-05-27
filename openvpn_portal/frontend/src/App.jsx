import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ControlPage } from "./pages/ControlPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StatusFilePage } from "./pages/StatusFilePage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/status-file" element={<StatusFilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
