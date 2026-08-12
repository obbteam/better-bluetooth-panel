/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DEVICE_LIST_STYLE_CLASS = 'bt-device-list';
const DOT_STYLE_CLASS = 'bt-status-dot';
const DOT_ON_STYLE_CLASS = 'bt-status-dot-on';
const INIT_RETRY_INTERVAL_MS = 200;
const INIT_MAX_RETRIES = 50; // give up after ~10s

export default class BluetoothHighlightExtension extends Extension {
    enable() {
        this._initRetries = 0;
        this._initId = null;
        this._tryInit();
    }

    _tryInit() {
        this._toggle = Main.panel.statusArea.quickSettings._bluetooth?.quickSettingsItems[0];

        if (!this._toggle) {
            if (this._initRetries++ >= INIT_MAX_RETRIES) return;
            this._initId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, INIT_RETRY_INTERVAL_MS, () => {
                this._initId = null;
                this._tryInit();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        this._toggle._deviceSection.actor.add_style_class_name(DEVICE_LIST_STYLE_CLASS);

        this._client = this._toggle._client;

        this._client.connectObject(
            'devices-changed', () => this._syncDeviceStyles(),
            'notify::active', () => this._syncDeviceStyles(),
            this);

        St.Settings.get().connectObject(
            'notify::accent-color', () => this._syncDeviceStyles(),
            'notify::color-scheme', () => this._syncDeviceStyles(),
            this);

        this._syncDeviceStyles();
    }

    _getAccentBackgroundStyle() {
        const [bgColor] = St.ThemeContext.get_for_stage(global.stage).get_accent_color();
        const r = Math.round(bgColor.get_red() * 255);
        const g = Math.round(bgColor.get_green() * 255);
        const b = Math.round(bgColor.get_blue() * 255);
        return `background-color: rgba(${r}, ${g}, ${b}, 0.25);`;
    }

    _syncDeviceStyles() {
        const accentStyle = this._getAccentBackgroundStyle();

        for (const item of this._toggle._deviceItems.values()) {
            const connected = item._device.connected;

            if (connected) {
                item.set_style(accentStyle);
            } else {
                item.set_style(null);
            }

            item._subtitle.text = connected ? 'Connected' : 'Disconnected';

            let dot = item._btStatusDot;
            if (!dot) {
                dot = new St.Widget({
                    style_class: DOT_STYLE_CLASS,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                item.insert_child_below(dot, item._subtitle);
                item._btStatusDot = dot;
            }

            if (connected)
                dot.add_style_class_name(DOT_ON_STYLE_CLASS);
            else
                dot.remove_style_class_name(DOT_ON_STYLE_CLASS);
        }
    }

    _cleanupDeviceStyles() {
        if (!this._toggle)
            return;

        for (const item of this._toggle._deviceItems.values()) {
            const connected = item._device.connected;

            item.set_style(null);
            item._subtitle.text = connected ? 'Disconnect' : 'Connect';

            item._btStatusDot?.destroy();
            delete item._btStatusDot;
        }

        this._toggle._deviceSection.actor.remove_style_class_name(DEVICE_LIST_STYLE_CLASS);
    }

    disable() {
        this._cleanupDeviceStyles();

        if (this._initId) {
            GLib.source_remove(this._initId);
            this._initId = null;
        }
        this._client?.disconnectObject(this);
        this._client = null;
        St.Settings.get().disconnectObject(this);
        this._toggle = null;
    }
}