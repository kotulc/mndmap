import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PublicationEmbed } from "./Embed.js";
import "./embed.css";

const root = document.getElementById("root");
if (!root) throw new Error("Publication embed root is missing");
createRoot(root).render(<StrictMode><PublicationEmbed /></StrictMode>);
