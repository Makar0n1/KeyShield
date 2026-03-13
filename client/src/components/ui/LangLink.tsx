import { Link, type LinkProps } from 'react-router-dom'
import { useLangPath } from '@/hooks/useLang'

type LangLinkProps = Omit<LinkProps, 'to'> & { to: string }

export function LangLink({ to, ...props }: LangLinkProps) {
  const langPath = useLangPath()
  return <Link to={langPath(to)} {...props} />
}
