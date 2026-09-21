import { InstanceStatus, TelnetHelper } from '@companion-module/base'
import { EventEmitter } from 'node:events';

export class OnyxClient extends EventEmitter {
	activeCuelists
	#config
	#socket
	#pollTimer

	constructor(config) {
		super()
		this.#config = config
		this.activeCuelists = []
	}

	createClient() {
		this.#socket = new TelnetHelper(this.#config.host, this.#config.port, { reconnect: true, reconnect_interval: 1000 })

		this.#socket.on('status_change', (status, message) => {
			this.emit('log', { type: 'info', msg: 'New status from telnet: ' + status + ' ' + message })
			this.emit('status', { status: status, msg: message })
		})

		this.#socket.on('connect', () => {
			this.emit('log', { type: 'info', msg: 'Connected to Onyx console' })
			this.emit('status', { status: InstanceStatus.Ok })

			// Start polling for active cuelists, only if using ONYX Manager
			if (this.#config.usingManager) this.#startPolling()
		})

		this.#socket.on('error', (err) => {
			this.emit('log', { type: 'error', msg: 'Error with connection to console: ' + err.message })
			this.emit('status', { status: InstanceStatus.ConnectionFailure })
		})

		this.#socket.on('close', (hadError) => {
			if (hadError) {
				this.emit('log', { type: 'error', msg: 'Socket closed due to an error.' })
			} else {
				this.emit('log', { type: 'error', msg: 'Socket closed.'})
			}
		})

		this.#socket.on('data', (buffer) => {
			this.#parseData(buffer)
		})
	}

	updateConfig(config) {
		this.#config = config
	}

	destroyClient() {
		if (this.#pollTimer) {
			clearInterval(this.#pollTimer)
			this.#pollTimer = null
		}
		if (this.#socket) {
			this.#socket.destroy()
			this.#socket = undefined
		}
	}

	// Function to send Telnet command to Onyx console
	async sendCommand(cmd) {
		try {
			await this.#socket.send(cmd + '\r\n')
			this.emit('log', { type: 'info', msg: `Command sent: ${cmd}` })
		} catch (e) {
			this.emit('log', { type: 'error', msg: `Error when sending command ${cmd}: ${err}` })
		}
	}

	#startPolling() {
		if (this.#pollTimer) {
			clearInterval(this.#pollTimer)
		}

		this.emit('log', {type: 'debug', msg: `Polling interval: ${this.#config.polling_interval}` })
		this.#pollTimer = setInterval(() => {
			this.#getActiveCuelists()
		}, this.#config.polling_interval)
	}

	#getActiveCuelists() {
		this.activeCuelists = []
		sendCommand('QLActive')
	}

	// Function to parse incoming data
	#parseData(buffer) {
		const data = buffer.toString('utf8')
		this.emit('log', { type: 'debug', msg: `Received data: ${data}` })

		const lines = data.split(/\r?\n/) // remove eom character
		for (const line of lines) {
			const num = parseInt(line)
			if (!isNaN(num) && num != 200) {
				this.activeCuelists.push(num)

				this.emit('cuelists_updated', this.activeCuelists)
				this.emit('check_feedbacks', 'ActiveCuelist') // Update feedbacks after active cuelist data received
			}
		}
	}
}
