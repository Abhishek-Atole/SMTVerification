import { appConfig } from "@/lib/appConfig";

type AppLogoProps = {
  className?: string;
};

export function AppLogo({ className }: AppLogoProps) {
  if (appConfig.logoUrl) {
    return (
      <img
        src={appConfig.logoUrl}
        alt={appConfig.companyShort}
        className={className}
        style={{ objectFit: "contain" }}
        onError={(event) => {
          (event.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        background: "#1A3557",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 12px",
        color: "#fff",
        fontWeight: 700,
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
      }}
    >
      {appConfig.companyShort}
    </div>
  );
}