import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

const root = document.getElementById("batcave-root");
if (root) {
  createRoot(root).render(<App />);
}
