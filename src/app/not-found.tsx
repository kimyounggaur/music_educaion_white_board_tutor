import Link from "next/link";

export default function NotFound() {
  return (
    <main className="notfound">
      <h1>찾는 수업이 없어요</h1>
      <p>주소가 바뀌었거나 아직 준비되지 않은 수업이에요.</p>
      <p>
        <Link href="/" className="btn btn-primary">
          수업 목록으로
        </Link>
      </p>
    </main>
  );
}
