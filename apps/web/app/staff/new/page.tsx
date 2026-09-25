import { redirect } from 'next/navigation';

export default function NewStaff() {
  redirect('/staff?new=1');
}
