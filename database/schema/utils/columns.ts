import { timestamp, uuid } from 'drizzle-orm/pg-core'

export const identifierColumn = uuid().primaryKey().defaultRandom()

export const timestampColumns = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}
