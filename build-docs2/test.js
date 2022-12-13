const handler = require('./index.js').handler

;(async function () {
  try {
    await handler({
      data: Buffer.from(JSON.stringify({
        domain: '5f668e9e0b66a926cb549dca'
      }))
    }, {
      eventId: Math.random()
    })
    process.exit()
  } catch (e) {
    console.log(e)
  }
})()
