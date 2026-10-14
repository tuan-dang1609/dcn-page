import { Link } from "react-router-dom";
import { PAGE_FRAME_CLASS } from "@/components/TournamentMasthead";

const GREY = "text-[#9A9893]";

/** Đầu trang các trang org / link mời. */
const GroupsHeader = () => (
  <header className={PAGE_FRAME_CLASS}>
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-[#F2F0EB]">
      <Link to="/" className="text-[17px] font-extrabold no-underline">
        DCN
      </Link>
      <nav className="flex gap-5 text-sm">
        <Link to="/orgs" className="font-semibold">
          Org
        </Link>
        <Link to="/profile" className={GREY}>
          Hồ sơ
        </Link>
      </nav>
    </div>
  </header>
);

export default GroupsHeader;
