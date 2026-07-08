const LOADER_ICON_URL =
  "https://nybmykdjtkjaatepkfog.supabase.co/storage/v1/object/public/image/users/1779469977112-waiting.png";

type PageLoaderProps = {
  label?: string;
  fullScreen?: boolean;
};

const PageLoader = ({
  label = "Đang tải...",
  fullScreen = true,
}: PageLoaderProps) => {
  return (
    <div
      className={`flex w-full items-center justify-center bg-background ${
        fullScreen ? "min-h-screen" : "py-24"
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-20 w-20 flex-col items-center justify-end">
          <img
            src={LOADER_ICON_URL}
            alt="Đang tải"
            className="loader-run h-16 w-16 object-contain"
          />
          <span className="loader-shadow mt-1 h-1.5 w-12 rounded-full bg-neutral-600" />
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-neutral-400">
          {label}
        </p>
      </div>
    </div>
  );
};

export default PageLoader;
