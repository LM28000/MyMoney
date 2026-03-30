import type { NextFunction, Request, Response } from 'express'
import { ZodError, type ZodType } from 'zod'

import { logger } from './logger'

export class HttpError extends Error {
  statusCode: number
  details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.details = details
  }
}

const validate = <T>(schema: ZodType<T>, value: unknown) => schema.parse(value)

export const validateBody = <T>(schema: ZodType<T>) => (request: Request, _response: Response, next: NextFunction) => {
  try {
    request.body = validate(schema, request.body)
    next()
  } catch (error) {
    next(error)
  }
}

export const validateParams = <T>(schema: ZodType<T>) => (request: Request, _response: Response, next: NextFunction) => {
  try {
    request.params = validate(schema, request.params) as Request['params']
    next()
  } catch (error) {
    next(error)
  }
}

export const validateQuery = <T>(schema: ZodType<T>) => (request: Request, _response: Response, next: NextFunction) => {
  try {
    _response.locals.validatedQuery = validate(schema, request.query)
    next()
  } catch (error) {
    next(error)
  }
}

export const errorHandler = (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: 'Validation error',
      details: error.flatten(),
    })
    return
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      error: error.message,
      details: error.details,
    })
    return
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error'
  logger.error(message)
  response.status(500).json({ error: 'Internal server error' })
}

export const notFoundHandler = (_request: Request, response: Response) => {
  response.status(404).json({ error: 'Route not found' })
}