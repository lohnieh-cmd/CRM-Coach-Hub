import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const tok = localStorage.getItem("ascent_token");
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && !err.config?.url?.includes("/auth/")) {
      localStorage.removeItem("ascent_token");
      localStorage.removeItem("ascent_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const API_BASE = API;
