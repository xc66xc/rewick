import net from 'node:net'

/** Isolated SMTP sink: accepts test mail on loopback and never delivers it. */
export async function startSmtpMock() {
  const messages = []
  const sockets = new Set()
  const server = net.createServer(socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.setEncoding('utf8')
    let pending = '', data = false, content = []
    socket.write('220 localhost ESMTP test-sink\r\n')
    socket.on('data', chunk => {
      pending += chunk
      let index
      while ((index = pending.indexOf('\r\n')) !== -1) {
        const line = pending.slice(0, index)
        pending = pending.slice(index + 2)
        if (data) {
          if (line === '.') { messages.push(content.join('\r\n')); content = []; data = false; socket.write('250 accepted\r\n') }
          else content.push(line.replace(/^\.\./, '.'))
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-localhost\r\n250 8BITMIME\r\n')
        else if (/^DATA/i.test(line)) { data = true; socket.write('354 end with dot\r\n') }
        else if (/^QUIT/i.test(line)) socket.end('221 goodbye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port, messages,
    code() {
      const raw = messages.at(-1) ?? ''
      const body = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n')
      const decoded = /Content-Transfer-Encoding: base64/i.test(raw) ? Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')
        : /Content-Transfer-Encoding: quoted-printable/i.test(raw) ? Buffer.from(body.replace(/=\r\n/g, '').replace(/=([A-F\d]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'binary').toString('utf8') : body
      const match = decoded.match(/\b\d{6}\b/)
      if (!match) throw new Error('Test SMTP message has no verification code')
      return match[0]
    },
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)) },
  }
}
