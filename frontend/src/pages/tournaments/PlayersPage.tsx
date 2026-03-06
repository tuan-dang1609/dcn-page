import { useOutletContext } from "react-router-dom";

type PlayersOutletContext = {
  tournament?: {
    registered?: Array<{
      id?: number | string;
      name?: string;
      logo_url?: string;
      team_color_hex?: string;
    }>;
  };
  isLoading?: boolean;
};

const PlayersPage = () => {
  const { tournament, isLoading } = useOutletContext<PlayersOutletContext>();

  const apiPlayersRaw = tournament?.registered ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-heading">Người chơi</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải người chơi...</p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {apiPlayersRaw.map((participant, i) => (
          <div
            key={`${participant.id}-${participant.name}`}
            className="neo-box-sm bg-card p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <img
                src={participant.logo_url}
                alt={participant.name}
                className="w-8 h-8"
              />
              <span className="font-bold">{participant.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayersPage;
