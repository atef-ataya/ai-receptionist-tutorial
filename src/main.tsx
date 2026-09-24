import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";

const Customer = lazy(() => import("./pages/Customer").then(module => ({ default: module.Customer })));
const Admin = lazy(() => import("./pages/Admin").then(module => ({ default: module.Admin })));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="route-loader">Opening Velo…</div>}>
        <Routes>
          <Route path="/" element={<Customer />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>
);
