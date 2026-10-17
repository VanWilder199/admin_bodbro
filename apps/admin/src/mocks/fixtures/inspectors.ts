import type { InspectorDto } from '@/api/types';
import { mail, phone, uuid } from './ids';

export function createInspectors(): InspectorDto[] {
  return [
    { id: uuid(101), telegramUserId: 100000101, fullName: 'Иван Петров', phone: phone(1), email: mail('ivan.petrov'), status: 'pending' },
    { id: uuid(102), telegramUserId: 100000102, fullName: 'Анна Сидорова', phone: phone(2), email: mail('anna.sidorova'), status: 'pending' },
    { id: uuid(103), telegramUserId: 100000103, fullName: 'Олег Кравец', phone: phone(3), email: mail('oleg.kravets'), status: 'verified' },
    { id: uuid(104), telegramUserId: 100000104, fullName: 'Мария Лисицына', phone: phone(4), email: mail('maria.lisitsyna'), status: 'verified' },
    { id: uuid(105), telegramUserId: 100000105, fullName: 'Денис Волков', phone: phone(5), email: mail('denis.volkov'), status: 'banned' },
  ];
}
