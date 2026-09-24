import { Link } from "react-router-dom";

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Velo Auto Studio home">
      <span className="brand-mark" aria-hidden="true"><i /><i /></span>
      <span><strong>VELO</strong><small>AUTO STUDIO</small></span>
    </Link>
  );
}
