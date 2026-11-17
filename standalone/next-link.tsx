import type { AnchorHTMLAttributes } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

/**
 * 한 파일 배포판에서 next/link 대신 쓰는 아주 작은 링크.
 * 서버가 없어서 수업 주소(/lesson/아이디)는 #아이디로, 처음 화면(/)은 #로 바꾼다.
 */
export default function Link({ href, children, ...rest }: LinkProps) {
  const mapped = href === "/" ? "#" : href.startsWith("/lesson/") ? `#${href.slice("/lesson/".length)}` : href;
  return (
    <a href={mapped} {...rest}>
      {children}
    </a>
  );
}
