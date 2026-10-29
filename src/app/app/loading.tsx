// Мгновенный отклик при переходе: каркас показывается сразу, пока сервер готовит данные страницы
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка" className="animate-pulse space-y-4">
      <div className="h-7 w-44 rounded-lg bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-surface-2" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}
