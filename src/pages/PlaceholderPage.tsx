export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="placeholder-screen">
      <span className="eyebrow">Accès restreint</span>
      <h1>{title}</h1>
      <p className="lead">
        Cet écran est réservé à l'administrateur fonctionnel. Vos droits sont déterminés par votre compte Microsoft 365.
      </p>
    </div>
  );
}
