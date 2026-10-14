import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { PAGE_FRAME_CLASS } from "@/components/TournamentMasthead";
import { uploadImageToSupabase } from "@/lib/supabaseUpload";
import { apiErrorMessage, createOrg, getMyGroups, listOrgs, ROLE_LABEL } from "@/api/groups";
import GroupLogo from "@/components/groups/GroupLogo";
import GroupsHeader from "@/components/groups/GroupsHeader";

/**
 * /orgs — danh sách org (tìm theo tên / tag), org của tôi, lập org mới.
 * Org thi series và giải lẻ dưới chung tên/logo; 1 người tối đa 1 org.
 */

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";
const INPUT = `min-h-11 w-full border ${RULE} bg-transparent px-3 text-sm outline-none focus:border-[#F2F0EB]`;

const CreateOrgForm = ({ onCreated }: { onCreated: (id: number | string) => void }) => {
  const { token, refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const logoUrl = logo ? await uploadImageToSupabase(logo, token) : null;
      const { data } = await createOrg({ name: name.trim(), short_name: tag.trim(), logo_url: logoUrl }, token);
      toast({ title: "Đã lập org" });
      await refreshUser?.();
      onCreated(data.data.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
        <input className={INPUT} placeholder="Tên org" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
        <input
          className={`${INPUT} uppercase`}
          placeholder="Tag"
          value={tag}
          maxLength={16}
          onChange={(e) => setTag(e.target.value)}
        />
      </div>
      <label className={`flex min-h-11 cursor-pointer items-center gap-3 border border-dashed ${RULE} px-3 text-sm ${GREY}`}>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
        />
        {logo ? `Logo: ${logo.name}` : "Chọn logo (không bắt buộc)"}
      </label>
      {error ? <p className="m-0 text-sm text-[#FF4A3D]">{error}</p> : null}
      <div>
        <button
          type="button"
          disabled={busy || name.trim().length < 2 || tag.trim().length < 2}
          onClick={() => void submit()}
          className="inline-flex min-h-11 items-center bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B] disabled:opacity-50"
        >
          {busy ? "Đang tạo…" : "Lập org"}
        </button>
      </div>
    </div>
  );
};

const OrgsPage = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const orgsQuery = useQuery({
    queryKey: ["orgs", search],
    queryFn: async () => (await listOrgs(search.trim())).data.data,
  });
  const mineQuery = useQuery({
    queryKey: ["my-groups", user?.id],
    enabled: Boolean(user && token),
    queryFn: async () => (await getMyGroups(token!)).data.data,
  });
  const myOrg = mineQuery.data?.orgs?.[0];

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-[#F2F0EB]">
      <GroupsHeader />
      <main className={`${PAGE_FRAME_CLASS} pb-16 pt-8`}>
        <h1 className="m-0 text-[40px] font-extrabold leading-[1.05] tracking-[-0.035em] md:text-[64px]">Org</h1>
        <p className={`mt-2 max-w-2xl text-sm ${GREY}`}>
          Org thi đấu series và giải lẻ dưới chung tên. Mỗi người thuộc tối đa một org; sáng lập / lead chọn đội hình và
          đội trưởng cho từng giải.
        </p>

        {/* Org của tôi */}
        {user ? (
          <section className="mt-8 border-t-2 border-[#F2F0EB] pt-3">
            <h2 className="m-0 text-[15px] font-extrabold">Org của bạn</h2>
            {myOrg ? (
              <Link
                to={`/orgs/${myOrg.id}`}
                className={`mt-3 flex min-h-16 items-center gap-3 border-b ${RULE} pb-3 no-underline hover:opacity-80`}
              >
                <GroupLogo group={myOrg} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-extrabold">{myOrg.name}</span>
                  <span className={`text-xs ${GREY}`}>
                    {myOrg.short_name} · {ROLE_LABEL[myOrg.role]}
                  </span>
                </span>
                <span className="text-sm font-bold">Quản lý →</span>
              </Link>
            ) : showCreate ? (
              <div className="mt-3">
                <CreateOrgForm onCreated={(id) => navigate(`/orgs/${id}`)} />
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className={`text-sm ${GREY}`}>Bạn chưa ở org nào — xin vào một org bên dưới, hoặc</span>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className={`inline-flex min-h-11 items-center border ${RULE} px-4 text-sm font-bold`}
                >
                  Lập org mới
                </button>
              </div>
            )}
          </section>
        ) : null}

        {/* Danh sách */}
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#F2F0EB] pb-2">
            <h2 className="m-0 text-[15px] font-extrabold">Tất cả org</h2>
            <input
              className={`${INPUT} max-w-xs`}
              placeholder="Tìm theo tên / tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {orgsQuery.isLoading ? <p className={`mt-4 text-sm ${GREY}`}>Đang tải…</p> : null}
          <ul className="m-0 grid list-none p-0 md:grid-cols-2 md:gap-x-8">
            {(orgsQuery.data ?? []).map((org) => (
              <li key={org.id}>
                <Link
                  to={`/orgs/${org.id}`}
                  className={`flex min-h-16 items-center gap-3 border-b ${RULE} py-2 no-underline hover:bg-[#151514]`}
                >
                  <GroupLogo group={org} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{org.name}</span>
                    <span className={`block truncate text-xs ${GREY}`}>
                      {org.short_name}
                      {org.founder_name ? ` · sáng lập: ${org.founder_name}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs tabular-nums ${GREY}`}>{org.member_count ?? 0} người</span>
                </Link>
              </li>
            ))}
          </ul>
          {orgsQuery.data && !orgsQuery.data.length ? (
            <p className={`mt-4 text-sm ${GREY}`}>Không tìm thấy org nào.</p>
          ) : null}
        </section>
      </main>
    </div>
  );
};

export default OrgsPage;
