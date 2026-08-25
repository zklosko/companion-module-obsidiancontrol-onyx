import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'
import { configFields } from './src/config.js'
import { upgradeScripts } from './src/upgrades.js'
import { OnyxClient } from './src/telnet/client.js'
import { UpdateActions } from './src/actions.js'
import { UpdateVariableDefinitions } from './src/variables.js'
import { UpdatePresetDefinitions } from './src/presets.js'
import { UpdateFeedbacks } from './src/feedbacks.js'

class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		// The following runs when the module is opened for the first time or when the config is changed
		this.config = config

		await this.configUpdated(config)

		this.OnyxClient = new OnyxClient(config)

		this.OnyxClient.on('log', (logInfo) => {
			this.log(logInfo.type, logInfo.msg)
		})

		this.OnyxClient.on('status', (statusInfo) => {
			const message = statusInfo.msg ?? ''
			this.updateStatus(statusInfo.status, message)
		})

		this.OnyxClient.on('cuelists_updated', (activeCuelists) => {
			this.setVariableValues({
				activeCuelists: activeCuelists
			})
		})

		this.OnyxClient.on('check_feedbacks', (feedback) => {
			this.checkFeedbacks(feedback)
		})

		this.updateStatus(InstanceStatus.Ok)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
		this.updatePresetDefinitions()

		// Connect on module launch
		if (this.config.host) {
			this.OnyxClient.createClient()
		}
	}

	// When module gets deleted or deactivated
	async destroy() {
		this.OnyxClient.destroyClient()
		this.log('debug', 'Onyx module instance destroyed.')
	}

	async configUpdated(config) {
		// Delete Telnet client if it already exists (i.e. wasn't deleted by destroy function)
		if (this.socket) {
			this.socket.destroy()
			this.socket = null
		}

		this.config = config
		this.updateActions() // export actions
		this.setVariableValues({
			usingManager: this.config.usingManager,
		})

		// Update config and connect
		if (this.config.host) {
			this.OnyxClient.destroyClient()
			this.OnyxClient.updateConfig(this.config)
			this.OnyxClient.createClient()
		}
	}

	// Return config fields for web config
	getConfigFields() {
		return configFields
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}

	updatePresetDefinitions() {
		UpdatePresetDefinitions(this)
	}
}

runEntrypoint(ModuleInstance, upgradeScripts)
