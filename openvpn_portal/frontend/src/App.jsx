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
        <Route path="/status-file" element={<StatusFilePage />} />
        <Route path="/operations" element={<ControlPage />} />
        <Route path="/control" element={<Navigate to="/operations" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
